import { getAccessToken } from "./auth";

/** Helper to ensure token is valid */
const tokenOrThrow = async () => {
    const t = await getAccessToken();
    if (!t) throw new Error("Not authenticated");
    return t;
}

/** Extracts folder ID from a Google Drive Folder URL */
export function extractFolderId(urlStr: string): string {
    try {
        const url = new URL(urlStr);
        // Typical format: https://drive.google.com/drive/folders/123abc456def
        const pathParts = url.pathname.split('/');
        if (pathParts.includes('folders')) {
            return pathParts[pathParts.indexOf('folders') + 1];
        } else if (url.searchParams.has("id")) {
           return url.searchParams.get("id")!;
        }
        return urlStr; // Fallback to returning the string itself if it's just the ID
    } catch {
       return urlStr; // Fallback
    }
}

/** List all Spreadsheet files in a given Drive folder */
export async function getSpreadsheetsInFolder(folderId: string) {
    const token = await tokenOrThrow();
    const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Drive API Error: ${await res.text()}`);
    const data = await res.json();
    return data.files as { id: string, name: string }[];
}

export type SheetConfig = { spreadsheetId: string, spreadsheetName: string, tabs: string[] };

/** Fetches tabs (sheets) inside a specific spreadsheet */
export async function getSpreadsheetTabs(spreadsheetId: string): Promise<string[]> {
    const token = await tokenOrThrow();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Sheets API Error: ${await res.text()}`);
    const data = await res.json();
    return data.sheets.map((s: any) => s.properties.title);
}

/** Fetches the first row (headers) of a given tab */
export async function getSheetHeaders(spreadsheetId: string, tabName: string): Promise<string[]> {
    const token = await tokenOrThrow();
    const range = `'${tabName}'!1:1`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Sheets Header Fetch Error: ${await res.text()}`);
    const data = await res.json();
    if (!data.values || data.values.length === 0) return [];
    return data.values[0];
}

/** Fetches a single column of data, useful for duplicate checking */
export async function getColumnValues(spreadsheetId: string, tabName: string, letterIndex: string): Promise<string[]> {
    const token = await tokenOrThrow();
    const range = `'${tabName}'!${letterIndex}:${letterIndex}`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Sheets Column Fetch Error: ${await res.text()}`);
    const data = await res.json();
    if (!data.values) return [];
    // Flatten
    return data.values.map((row: string[]) => row[0]);
}

/** Appends a row to the end of a sheet tab */
export async function appendRow(spreadsheetId: string, tabName: string, rowValues: any[]) {
    const token = await tokenOrThrow();
    const range = `'${tabName}'!A1`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
        method: "POST",
        headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            values: [rowValues]
        })
    });
    if (!res.ok) throw new Error(`Sheets Append Error: ${await res.text()}`);
    return await res.json();
}
