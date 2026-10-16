use crate::models::schema::{
    ColumnItem, DatabaseItem, ForeignKeyItem, TableItem, TableObjects, TableSchema,
};
use crate::services::ConnectionManager;
use tauri::State;

#[tauri::command]
pub async fn get_databases(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<DatabaseItem>, String> {
    manager
        .get_databases(&connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    database: Option<String>,
    schema: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<TableItem>, String> {
    manager
        .get_tables(&connection_id, database.as_deref(), schema.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_columns(
    connection_id: String,
    database: Option<String>,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ColumnItem>, String> {
    manager
        .get_columns(
            &connection_id,
            database.as_deref(),
            &schema,
            &table,
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_table_objects(
    connection_id: String,
    database: Option<String>,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<TableObjects, String> {
    manager
        .get_table_objects(&connection_id, database.as_deref(), &schema, &table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_database_schema(
    connection_id: String,
    database: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<TableSchema>, String> {
    manager
        .get_database_schema(&connection_id, database.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_foreign_keys(
    connection_id: String,
    database: Option<String>,
    schema: Option<String>,
    table: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ForeignKeyItem>, String> {
    manager
        .get_foreign_keys(
            &connection_id,
            database.as_deref(),
            schema.as_deref(),
            table.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_database(
    connection_id: String,
    database: String,
    manager: State<'_, ConnectionManager>,
) -> Result<(), String> {
    manager
        .switch_database(&connection_id, &database)
        .await
        .map_err(|e| e.to_string())
}
