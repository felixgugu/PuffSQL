use crate::error::AppResult;
use crate::models::connection::ConnectionProfile;
use crate::models::import::{ImportCapabilities, ImportResult, ImportRowPayload};
use crate::models::query::QueryResult;
use crate::models::schema::{
    ColumnItem, DatabaseItem, ForeignKeyItem, SchemaItem, TableItem, TableObjects, TableSchema,
};
use async_trait::async_trait;
use tokio::sync::mpsc::UnboundedSender;

pub mod mssql;

#[async_trait]
pub trait DatabaseConnection: Send + Sync {
    fn spid(&self) -> u32 { 0 }
    fn current_database(&self) -> &str { "" }
    /// Cheap liveness probe for pooled connections. Used before reusing a session so a
    /// dropped connection (server restart, idle timeout, network reset) is detected
    /// without paying for a full handshake.
    async fn ping(&mut self) -> AppResult<()>;
    async fn execute_query(&mut self, sql: &str, max_rows: Option<usize>) -> AppResult<QueryResult>;
    async fn get_databases(&mut self) -> AppResult<Vec<DatabaseItem>>;
    async fn get_schemas(&mut self, database: Option<&str>) -> AppResult<Vec<SchemaItem>>;
    async fn get_tables(&mut self, database: Option<&str>, schema: Option<&str>) -> AppResult<Vec<TableItem>>;
    async fn get_columns(&mut self, database: Option<&str>, schema: &str, table: &str) -> AppResult<Vec<ColumnItem>>;
    /// Columns, constraints, indexes and triggers of one object, read in a single round trip.
    async fn get_table_objects(
        &mut self,
        database: Option<&str>,
        schema: &str,
        table: &str,
    ) -> AppResult<TableObjects>;
    async fn get_foreign_keys(&mut self, database: Option<&str>, schema: Option<&str>, table: Option<&str>) -> AppResult<Vec<ForeignKeyItem>>;
    async fn get_database_schema(&mut self, database: Option<&str>) -> AppResult<Vec<TableSchema>>;
    async fn switch_database(&mut self, database: &str) -> AppResult<()>;
    async fn get_import_capabilities(
        &mut self,
        database: Option<&str>,
        schema: &str,
        table: &str,
    ) -> AppResult<ImportCapabilities>;
    /// Inserts every row inside a single transaction. Any failure rolls the whole batch back.
    async fn import_table_rows(
        &mut self,
        database: Option<&str>,
        schema: &str,
        table: &str,
        columns: &[String],
        rows: &[ImportRowPayload],
        manual_identity: bool,
        progress: Option<UnboundedSender<usize>>,
    ) -> AppResult<ImportResult>;
}

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    async fn connect(
        &self,
        profile: &ConnectionProfile,
        password: &str,
    ) -> AppResult<Box<dyn DatabaseConnection>>;

    async fn test_connection(
        &self,
        profile: &ConnectionProfile,
        password: &str,
    ) -> AppResult<()>;
}
