export type ParsedData = {
  name_english?: string;
  name_arabic?: string;
  university?: string;
  level?: string;
  whatsapp_no: string;
  course_name?: string;
  price?: number;
  key_person?: string;
};

export type TargetSheet = {
  spreadsheetId: string;
  spreadsheetName: string;
  tabName: string;
  score: number;
};

export type ProcessLog = {
  id: string;
  message: string;
  status: 'info' | 'success' | 'error' | 'loading';
};
