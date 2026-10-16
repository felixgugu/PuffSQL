use crate::models::query::QueryResult;
use crate::services::ConnectionManager;
use tauri::State;

/// Runs the work on its own task so a *panic* becomes an error instead of a silent dead task.
///
/// A panicking command used to take its task down with it, and the front end's `invoke` promise
/// then never settled: the editor sat in "executing" forever, reported nothing, and the cancel
/// button did nothing because the request it wanted to cancel no longer existed. Awaiting the join
/// handle is what turns that into a message the user (and the message panel) can act on.
async fn isolated<F, T>(work: F) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>> + Send + 'static,
    T: Send + 'static,
{
    match tauri::async_runtime::spawn(work).await {
        Ok(result) => result,
        Err(join_error) => Err(format!(
            "內部錯誤：查詢工作已中止（{join_error}）。請重試；若持續發生，請把這行訊息回報。"
        )),
    }
}

#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    database: Option<String>,
    sql: String,
    max_rows: Option<usize>,
    request_id: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<QueryResult, String> {
    let manager = manager.inner().clone();
    isolated(async move {
        manager
            .execute_query(&connection_id, database.as_deref(), &sql, max_rows, request_id.as_deref())
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn cancel_query(
    connection_id: String,
    request_id: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    isolated(async move {
        manager
            .cancel_query(&connection_id, request_id.as_deref())
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn get_connection_spid(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Option<u32>, String> {
    manager
        .get_connection_spid(&connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_query_log_file() -> Result<String, String> {
    crate::services::QueryLogger::open_log_file().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_query_log_path() -> Result<String, String> {
    let path = crate::services::QueryLogger::resolve_log_path();
    Ok(path.to_string_lossy().to_string())
}
