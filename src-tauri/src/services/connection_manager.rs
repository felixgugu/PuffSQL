use crate::drivers::mssql::SqlServerDriver;
use crate::drivers::{DatabaseConnection, DatabaseDriver};
use crate::error::{AppError, AppResult};
use crate::models::connection::{ConnectionProfile, SaveConnectionRequest};
use crate::models::import::{ImportCapabilities, ImportResult, ImportRowPayload};
use crate::models::query::{QueryMessage, QueryResult};
use crate::models::schema::{
    ColumnItem, DatabaseItem, ForeignKeyItem, TableItem, TableObjects, TableSchema,
};
use crate::services::credential_store::CredentialStore;
use crate::services::query_logger::QueryLogger;
use crate::services::storage_service::StorageService;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex as TokioMutex;
use tokio::sync::mpsc::UnboundedSender;
use uuid::Uuid;

#[allow(dead_code)]
struct ActiveQueryState {
    request_id: String,
    connection_id: String,
    spid: u32,
    cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

#[derive(Clone)]
pub struct ConnectionManager {
    credential_store: CredentialStore,
    storage: StorageService,
    active_connections: Arc<TokioMutex<HashMap<String, Arc<TokioMutex<Box<dyn DatabaseConnection>>>>>>,
    password_cache: Arc<StdMutex<HashMap<String, String>>>,
    active_queries: Arc<StdMutex<HashMap<String, ActiveQueryState>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            credential_store: CredentialStore::new(),
            storage: StorageService::new(),
            active_connections: Arc::new(TokioMutex::new(HashMap::new())),
            password_cache: Arc::new(StdMutex::new(HashMap::new())),
            active_queries: Arc::new(StdMutex::new(HashMap::new())),
        }
    }

    pub fn get_profiles(&self) -> AppResult<Vec<ConnectionProfile>> {
        self.storage.load_profiles()
    }

    pub async fn save_profile(&self, req: SaveConnectionRequest) -> AppResult<ConnectionProfile> {
        let mut profiles = self.storage.load_profiles()?;
        let now = Utc::now().to_rfc3339();

        let id = req.id.unwrap_or_else(|| Uuid::new_v4().to_string());

        let trimmed_name = req.name.trim();
        if trimmed_name.is_empty() {
            return Err(AppError::Connection {
                message: "Connection name cannot be empty".to_string(),
            });
        }

        if profiles
            .iter()
            .any(|p| p.id != id && p.name.trim().eq_ignore_ascii_case(trimmed_name))
        {
            return Err(AppError::Connection {
                message: format!(
                    "A connection named '{}' already exists. Please choose a different name.",
                    trimmed_name
                ),
            });
        }

        let has_explicit_password = req
            .password
            .as_ref()
            .map(|p| !p.is_empty())
            .unwrap_or(false);

        if has_explicit_password {
            let password = req.password.as_ref().unwrap();
            let _ = self.credential_store.save_password(&id, password);
            if let Ok(mut cache) = self.password_cache.lock() {
                cache.insert(id.clone(), password.clone());
            }
        } else if let Some(ref source_id) = req.copy_password_from {
            let source_pwd = self.get_password(source_id);
            if !source_pwd.is_empty() {
                let _ = self.credential_store.save_password(&id, &source_pwd);
                if let Ok(mut cache) = self.password_cache.lock() {
                    cache.insert(id.clone(), source_pwd);
                }
            }
        }

        let profile = ConnectionProfile {
            id: id.clone(),
            name: trimmed_name.to_string(),
            alias: req.alias.clone(),
            engine: req.engine,
            host: req.host,
            port: req.port,
            database: req.database,
            username: req.username,
            encrypt: req.encrypt,
            trust_server_certificate: req.trust_server_certificate,
            created_at: now.clone(),
            updated_at: now,
            color: req.color,
            modification_prompt: req.modification_prompt,
        };

        let saved = if let Some(idx) = profiles.iter().position(|p| p.id == id) {
            let mut existing = profile.clone();
            existing.created_at = profiles[idx].created_at.clone();
            profiles[idx] = existing.clone();
            self.storage.save_profiles(&profiles)?;
            existing
        } else {
            profiles.push(profile.clone());
            self.storage.save_profiles(&profiles)?;
            profile
        };

        // Editing a profile must not keep reusing the previous handshake, which may
        // point at a different host/credentials; let the next connect() dial afresh.
        self.active_connections.lock().await.remove(&saved.id);

        Ok(saved)
    }

    pub async fn delete_profile(&self, id: &str) -> AppResult<()> {
        let mut profiles = self.storage.load_profiles()?;
        profiles.retain(|p| p.id != id);
        self.storage.save_profiles(&profiles)?;

        let _ = self.credential_store.delete_password(id);
        if let Ok(mut cache) = self.password_cache.lock() {
            cache.remove(id);
        }
        let mut conns = self.active_connections.lock().await;
        conns.remove(id);

        Ok(())
    }

    pub async fn test_connection(&self, req: SaveConnectionRequest) -> AppResult<()> {
        let temp_profile = ConnectionProfile {
            id: "test".to_string(),
            name: req.name,
            alias: req.alias,
            engine: req.engine,
            host: req.host,
            port: req.port,
            database: req.database,
            username: req.username,
            encrypt: req.encrypt,
            trust_server_certificate: req.trust_server_certificate,
            created_at: String::new(),
            updated_at: String::new(),
            color: req.color,
            modification_prompt: req.modification_prompt,
        };

        let password = if let Some(ref p) = req.password {
            if !p.is_empty() {
                p.clone()
            } else if let Some(ref source_id) = req.copy_password_from {
                self.get_password(source_id)
            } else {
                String::new()
            }
        } else if let Some(ref source_id) = req.copy_password_from {
            self.get_password(source_id)
        } else {
            String::new()
        };
        let driver = SqlServerDriver::new();
        driver.test_connection(&temp_profile, &password).await
    }

    fn get_password(&self, id: &str) -> String {
        let cached = self
            .password_cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(id).cloned());

        match cached {
            Some(p) if !p.is_empty() => p,
            _ => {
                let from_store = self
                    .credential_store
                    .get_password(id)
                    .ok()
                    .flatten()
                    .unwrap_or_default();

                if !from_store.is_empty() {
                    if let Ok(mut cache) = self.password_cache.lock() {
                        cache.insert(id.to_string(), from_store.clone());
                    }
                }
                from_store
            }
        }
    }

    pub async fn connect(&self, id: &str) -> AppResult<()> {
        // Fast path: keep the pooled session when it is still healthy so switching
        // between tabs bound to different connections skips the full TDS handshake.
        if self.reuse_pooled_connection(id).await {
            return Ok(());
        }

        let profiles = self.storage.load_profiles()?;
        let profile = profiles
            .iter()
            .find(|p| p.id == id)
            .ok_or_else(|| AppError::NotFound {
                message: format!("Connection profile {} not found", id),
            })?;

        let password = self.get_password(id);

        let driver = SqlServerDriver::new();
        let conn = driver.connect(profile, &password).await?;

        let mut conns = self.active_connections.lock().await;
        conns.insert(id.to_string(), Arc::new(TokioMutex::new(conn)));
        Ok(())
    }

    /// Keeps an existing pooled connection for `id` when it is still usable.
    ///
    /// Returns `true` when the caller can skip dialing. A connection that is currently
    /// locked is mid-request and therefore alive, so it is reused without queueing
    /// behind the in-flight call. A connection that fails its probe is dropped so the
    /// caller falls back to a fresh handshake.
    async fn reuse_pooled_connection(&self, id: &str) -> bool {
        let pooled = {
            let conns = self.active_connections.lock().await;
            conns.get(id).cloned()
        };

        let Some(conn_arc) = pooled else {
            return false;
        };

        let healthy = match conn_arc.try_lock() {
            Ok(mut conn) => conn.ping().await.is_ok(),
            Err(_) => true,
        };
        if healthy {
            return true;
        }

        // Only evict the exact entry we probed; a concurrent connect may have already
        // replaced it with a fresh session.
        let mut conns = self.active_connections.lock().await;
        if conns.get(id).is_some_and(|current| Arc::ptr_eq(current, &conn_arc)) {
            conns.remove(id);
        }
        false
    }

    pub async fn get_or_connect(&self, id: &str) -> AppResult<Arc<TokioMutex<Box<dyn DatabaseConnection>>>> {
        {
            let conns = self.active_connections.lock().await;
            if let Some(conn_arc) = conns.get(id) {
                return Ok(conn_arc.clone());
            }
        }
        self.connect(id).await?;
        let conns = self.active_connections.lock().await;
        conns.get(id).cloned().ok_or_else(|| AppError::Connection {
            message: format!("Not connected to connection '{}'", id),
        })
    }

    pub async fn get_connection_spid(&self, id: &str) -> AppResult<Option<u32>> {
        let conn_arc = {
            let conns = self.active_connections.lock().await;
            conns.get(id).cloned()
        };
        if let Some(conn_arc) = conn_arc {
            let conn = conn_arc.lock().await;
            Ok(Some(conn.spid()))
        } else {
            Ok(None)
        }
    }

    pub async fn disconnect(&self, id: &str) -> AppResult<()> {
        let mut conns = self.active_connections.lock().await;
        conns.remove(id);
        Ok(())
    }

    pub async fn execute_query(
        &self,
        id: &str,
        database: Option<&str>,
        sql: &str,
        max_rows: Option<usize>,
        request_id: Option<&str>,
    ) -> AppResult<QueryResult> {
        let conn_arc = self.get_or_connect(id).await?;
        let req_id = request_id
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();

        let spid = {
            let conn = conn_arc.lock().await;
            conn.spid()
        };

        {
            let mut queries = self.active_queries.lock().unwrap();
            queries.insert(
                req_id.clone(),
                ActiveQueryState {
                    request_id: req_id.clone(),
                    connection_id: id.to_string(),
                    spid,
                    cancel_tx: Some(cancel_tx),
                },
            );
        }

        let mut conn = conn_arc.lock().await;

        if let Some(target_db) = database {
            let target_db = target_db.trim();
            if !target_db.is_empty() && conn.current_database() != target_db {
                conn.switch_database(target_db).await?;
            }
        }

        let db_name = conn.current_database().to_string();
        let query_fut = conn.execute_query(sql, max_rows);

        let res = tokio::select! {
            biased;
            _ = &mut cancel_rx => {
                // Query was cancelled by user!
                QueryLogger::log_query(
                    id,
                    &db_name,
                    sql,
                    &[QueryMessage {
                        level: "warning".to_string(),
                        message: "Query was cancelled by user".to_string(),
                        code: None,
                        line_number: None,
                        timestamp: Utc::now().to_rfc3339(),
                    }],
                    0,
                    "CANCELLED",
                );

                // TCP stream is dirty due to mid-flight cancel; remove from pool
                {
                    let mut conns = self.active_connections.lock().await;
                    conns.remove(id);
                }
                // Preemptively re-connect in background so next query doesn't wait
                let self_clone = self.clone();
                let id_clone = id.to_string();
                tokio::spawn(async move {
                    let _ = self_clone.connect(&id_clone).await;
                });
                Err(AppError::QueryCancelled)
            }
            query_res = query_fut => {
                match &query_res {
                    Ok(result) => {
                        let has_error = result.messages.iter().any(|m| m.level == "error");
                        let status = if has_error { "ERROR" } else { "SUCCESS" };
                        QueryLogger::log_query(
                            id,
                            &db_name,
                            sql,
                            &result.messages,
                            result.execution_time_ms,
                            status,
                        );
                    }
                    Err(err) => {
                        QueryLogger::log_query(
                            id,
                            &db_name,
                            sql,
                            &[QueryMessage {
                                level: "error".to_string(),
                                message: err.to_string(),
                                code: None,
                                line_number: None,
                                timestamp: Utc::now().to_rfc3339(),
                            }],
                            0,
                            "ERROR",
                        );
                    }
                }
                query_res
            }
        };

        if let Ok(mut queries) = self.active_queries.lock() {
            queries.remove(&req_id);
        }

        res
    }

    pub async fn cancel_query(
        &self,
        connection_id: &str,
        request_id: Option<&str>,
    ) -> AppResult<()> {
        let query_state = {
            let mut queries = self.active_queries.lock().unwrap();
            if let Some(req_id) = request_id.filter(|s| !s.trim().is_empty()) {
                queries.remove(req_id)
            } else {
                let found_key = queries
                    .iter()
                    .find(|(_, q)| q.connection_id == connection_id)
                    .map(|(k, _)| k.clone());
                found_key.and_then(|k| queries.remove(&k))
            }
        };

        if let Some(mut state) = query_state {
            if let Some(tx) = state.cancel_tx.take() {
                let _ = tx.send(());
            }

            let spid = state.spid;
            if spid > 0 {
                let conn_id = state.connection_id.clone();
                let profiles = self.storage.load_profiles().unwrap_or_default();
                if let Some(profile) = profiles.into_iter().find(|p| p.id == conn_id) {
                    let password = self.get_password(&conn_id);
                    tokio::spawn(async move {
                        let driver = SqlServerDriver::new();
                        if let Ok(mut aux_conn) = driver.connect(&profile, &password).await {
                            let kill_sql = format!("KILL {};", spid);
                            let _ = aux_conn.execute_query(&kill_sql, None).await;
                        }
                    });
                }
            }
        } else {
            // If no active query was found in registry, still drop connection as a safeguard
            let mut conns = self.active_connections.lock().await;
            conns.remove(connection_id);
            let self_clone = self.clone();
            let id_clone = connection_id.to_string();
            tokio::spawn(async move {
                let _ = self_clone.connect(&id_clone).await;
            });
        }

        Ok(())
    }

    pub async fn get_databases(&self, id: &str) -> AppResult<Vec<DatabaseItem>> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.get_databases().await
    }

    pub async fn get_tables(
        &self,
        id: &str,
        database: Option<&str>,
        schema: Option<&str>,
    ) -> AppResult<Vec<TableItem>> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.get_tables(database, schema).await
    }

    pub async fn get_columns(
        &self,
        id: &str,
        database: Option<&str>,
        schema: &str,
        table: &str,
    ) -> AppResult<Vec<ColumnItem>> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.get_columns(database, schema, table).await
    }

    pub async fn get_table_objects(
        &self,
        id: &str,
        database: Option<&str>,
        schema: &str,
        table: &str,
    ) -> AppResult<TableObjects> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.get_table_objects(database, schema, table).await
    }

    pub async fn get_foreign_keys(
        &self,
        id: &str,
        database: Option<&str>,
        schema: Option<&str>,
        table: Option<&str>,
    ) -> AppResult<Vec<ForeignKeyItem>> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.get_foreign_keys(database, schema, table).await
    }

    pub async fn get_database_schema(
        &self,
        id: &str,
        database: Option<&str>,
    ) -> AppResult<Vec<TableSchema>> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.get_database_schema(database).await
    }

    pub async fn switch_database(&self, id: &str, database: &str) -> AppResult<()> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.switch_database(database).await
    }

    pub async fn get_import_capabilities(
        &self,
        id: &str,
        database: Option<&str>,
        schema: &str,
        table: &str,
    ) -> AppResult<ImportCapabilities> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;
        conn.get_import_capabilities(database, schema, table).await
    }

    /// Runs a TSV import inside a single transaction. On a driver level failure the pooled
    /// session is dropped, because an open transaction would otherwise leak into the next query.
    pub async fn import_table_rows(
        &self,
        id: &str,
        database: Option<&str>,
        schema: &str,
        table: &str,
        columns: Vec<String>,
        rows: Vec<ImportRowPayload>,
        manual_identity: bool,
        progress: Option<UnboundedSender<usize>>,
    ) -> AppResult<ImportResult> {
        let conn_arc = self.get_or_connect(id).await?;
        let mut conn = conn_arc.lock().await;

        let db_name = database
            .map(|db| db.to_string())
            .filter(|db| !db.is_empty())
            .unwrap_or_else(|| conn.current_database().to_string());

        let result = conn
            .import_table_rows(
                database,
                schema,
                table,
                &columns,
                &rows,
                manual_identity,
                progress,
            )
            .await;

        let summary = format!(
            "-- TSV import into [{}].[{}] ({} row(s), {} column(s))",
            schema,
            table,
            rows.len(),
            columns.len()
        );
        match &result {
            Ok(imported) => {
                let message = if imported.rolled_back {
                    format!(
                        "TSV import rolled back. {} problem row(s) reported.",
                        imported.errors.len()
                    )
                } else {
                    format!("TSV import completed. {} row(s) inserted.", imported.inserted_count)
                };
                QueryLogger::log_query(
                    id,
                    &db_name,
                    &summary,
                    &[QueryMessage {
                        level: if imported.rolled_back { "error" } else { "info" }.to_string(),
                        message,
                        code: None,
                        line_number: None,
                        timestamp: Utc::now().to_rfc3339(),
                    }],
                    imported.execution_time_ms,
                    if imported.rolled_back { "ERROR" } else { "SUCCESS" },
                );
            }
            Err(err) => {
                QueryLogger::log_query(
                    id,
                    &db_name,
                    &summary,
                    &[QueryMessage {
                        level: "error".to_string(),
                        message: err.to_string(),
                        code: None,
                        line_number: None,
                        timestamp: Utc::now().to_rfc3339(),
                    }],
                    0,
                    "ERROR",
                );
            }
        }

        if result.is_err() {
            drop(conn);
            let mut conns = self.active_connections.lock().await;
            conns.remove(id);
        }

        result
    }
}
