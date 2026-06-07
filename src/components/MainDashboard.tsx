import React, { useState, useEffect, useRef } from 'react';
import { ParsedData, ProcessLog, TargetSheet } from '../types';
import { Play, Check, AlertTriangle, FileSpreadsheet, Send, FileText, Terminal, CornerDownRight, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  extractFolderId, getSpreadsheetsInFolder, 
  getSpreadsheetTabs, getColumnValues, 
  appendRow, getSheetHeaders 
} from '../lib/google-api';
import { pickBestMatch, colIndexToLetter } from '../lib/algo';
import { getAccessToken } from '../lib/auth';

export function MainDashboard() {
  const [folderUrl, setFolderUrl] = useState('https://drive.google.com/drive/folders/1gkQCXtYKL2JvOMUEds1hY-J2ouoEJ8cu');
  const [rawText, setRawText] = useState('');
  const [logs, setLogs] = useState<ProcessLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [targetSheet, setTargetSheet] = useState<TargetSheet | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [forceAppend, setForceAppend] = useState(false);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [readyToAppend, setReadyToAppend] = useState(false);

  const endOfLogsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string, status: ProcessLog['status']) => {
    setLogs(prev => [...prev, { id: Math.random().toString(), message: msg, status }]);
  };

  const handleRunPipeline = async () => {
    if (!folderUrl || !rawText) {
      alert("Please provide both the Drive folder URL and the WhatsApp message.");
      return;
    }
    
    const token = await getAccessToken();
    if (!token) {
        alert("Please sign in with Google first.");
        return;
    }

    setIsProcessing(true);
    setLogs([]);
    setParsedData(null);
    setTargetSheet(null);
    setReadyToAppend(false);
    setIsDuplicate(false);
    setForceAppend(false);

    try {
      addLog("Initializing Neural Parser...", "info");
      addLog("Connecting to Gemini 3.5 Flash...", "loading");
      const res = await fetch("/api/analyze-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText })
      });
      if (!res.ok) throw new Error("Gemini API extraction failed");
      const data: ParsedData = await res.json();
      setParsedData(data);
      addLog(`Extraction Success: ${data.name_english || data.name_arabic || "Unknown"} for course [${data.course_name}]`, "success");

      const folderId = extractFolderId(folderUrl);
      addLog(`Querying Google Workspace (Folder: ${folderId.substring(0,8)}...)`, "loading");
      const spreadsheets = await getSpreadsheetsInFolder(folderId);
      addLog(`Located ${spreadsheets.length} spreadsheet(s) in directory.`, "success");

      if (spreadsheets.length === 0) {
          throw new Error("No spreadsheets found in the provided folder.");
      }

      addLog(`Fuzzy Matching target tab for: "${data.course_name || ''}"...`, "loading");
      let allTabs: { spreadsheetId: string, spreadsheetName: string, tabName: string }[] = [];
      for (const sheet of spreadsheets) {
          const tabs = await getSpreadsheetTabs(sheet.id);
          for (const t of tabs) {
             allTabs.push({ spreadsheetId: sheet.id, spreadsheetName: sheet.name, tabName: t });
          }
      }

      if (allTabs.length === 0) throw new Error("No tabs found across any spreadsheets.");

      const candidates = allTabs.map(t => t.tabName);
      const bestMatch = pickBestMatch(data.course_name || "", candidates);
      
      const target = allTabs.find(t => t.tabName === bestMatch.name)!;
      setTargetSheet({ ...target, score: bestMatch.score });
      addLog(`Target Acquired: Document [${target.spreadsheetName}] → Tab [${target.tabName}]`, "success");

      addLog("Fetching sheet headers...", "info");
      const headers = await getSheetHeaders(target.spreadsheetId, target.tabName);
      setSheetHeaders(headers);

      const whatsappColIdx = headers.findIndex(h => h.toLowerCase().includes("whatsapp") || h.includes("واتس") || h.includes("رقم") || h.toLowerCase().includes("phone"));
      if (whatsappColIdx !== -1 && data.whatsapp_no) {
         addLog(`Mapping 'WhatsApp' via column index ${whatsappColIdx}. Validating integrity...`, "loading");
         const letter = colIndexToLetter(whatsappColIdx);
         const colVals = await getColumnValues(target.spreadsheetId, target.tabName, letter);
         
         const cleanNumber = String(data.whatsapp_no).replace(/[^0-9]/g, '');
         const targetSuffix = cleanNumber.length > 8 ? cleanNumber.slice(-8) : cleanNumber;

         const isDup = colVals.some(v => {
            if (!v) return false;
            const cleanV = String(v).replace(/[^0-9]/g, '');
            if (cleanV.length === 0) return false;
            return cleanV.includes(targetSuffix) || targetSuffix.includes(cleanV);
         });

         if (isDup) {
             setIsDuplicate(true);
             addLog(`DUPLICATE RECORD DETECTED MATCHING: ${data.whatsapp_no}`, "error");
         } else {
             addLog("Identity verification passed. No duplicates found.", "success");
         }
      } else {
         addLog("Could not map 'WhatsApp/Phone' column. Skipping duplicate check.", "info");
      }

      setReadyToAppend(true);

    } catch (err: any) {
      addLog(err.message || 'Pipeline failed', "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAppend = async () => {
     if (!parsedData || !targetSheet || sheetHeaders.length === 0) return;
     if (isDuplicate && !forceAppend) return;

     setIsProcessing(true);
     addLog("Constructing final payload serialization...", "loading");
     
     try {
         const headersLower = sheetHeaders.map(h => h.toLowerCase().trim());
         const newRow = new Array(headersLower.length).fill("");

         const cleanValue = (val: any) => {
             if (val == null || String(val).toLowerCase() === "null") return "";
             return val;
         };

         for (let i = 0; i < headersLower.length; i++) {
             const h = headersLower[i];
             if (h.includes('name') || h.includes('اسم') || h.includes('الاسم')) {
                 if (h.includes('english') || h.includes('انجليز')) {
                     newRow[i] = cleanValue(parsedData.name_english);
                 } else if (h.includes('arabic') || h.includes('عرب')) {
                     newRow[i] = cleanValue(parsedData.name_arabic);
                 } else {
                     // Fallback for single generic "Name" column
                     newRow[i] = cleanValue(parsedData.name_english) || cleanValue(parsedData.name_arabic) || "";
                 }
             } else if (h.includes('university') || h.includes('جامع')) {
                 newRow[i] = cleanValue(parsedData.university);
             } else if (h.includes('level') || h.includes('مستوى') || h.includes('فرقة')) {
                 newRow[i] = cleanValue(parsedData.level);
             } else if (h.includes('whatsapp') || h.includes('واتس')) {
                 newRow[i] = cleanValue(parsedData.whatsapp_no);
             } else if (h.includes('date') || h.includes('تاريخ')) {
                 newRow[i] = new Date().toISOString().split('T')[0];
             } else if (h.includes('key person') || h.includes('شخص') || h.includes('محول')) {
                 newRow[i] = cleanValue(parsedData.key_person);
             } else if (h.includes('price') || h.includes('سعر') || h.includes('مبلغ')) {
                 newRow[i] = cleanValue(parsedData.price);
             }
         }

         addLog(`Transmitting row data via Google HTTP REST...`, "loading");
         await appendRow(targetSheet.spreadsheetId, targetSheet.tabName, newRow);
         addLog("Transaction committed. Record appended successfully.", "success");
         
         setReadyToAppend(false);
         setRawText("");

     } catch(err: any) {
         addLog(`Fatal Insertion Error: ${err.message}`, "error");
     } finally {
         setIsProcessing(false);
     }
  }

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto p-4 lg:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
        
        {/* LEFT COLUMN: Input Control Interface */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden"
          >
             <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-3xl rounded-full" />
             <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-6">
               <FileSpreadsheet className="text-teal-500" size={16} />
               Environment Config
             </h2>
             <div className="space-y-2">
               <label className="text-xs font-medium text-slate-500 uppercase tracking-wider pl-1">
                 Cloud Directory Resource (URL)
               </label>
               <input 
                 className="w-full bg-[#070B14]/80 border border-white/5 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all font-mono text-xs"
                 placeholder="https://drive.google.com/drive/folders/..."
                 value={folderUrl}
                 onChange={e => setFolderUrl(e.target.value)}
               />
             </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl flex-1 flex flex-col relative"
          >
             <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-6">
               <FileText className="text-indigo-400" size={16} />
               Raw Ingestion Channel
             </h2>
             <div className="flex-1 flex flex-col group relative">
               <textarea 
                 className="w-full flex-1 bg-[#070B14]/80 border border-white/5 rounded-xl p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none min-h-[220px] font-mono text-[13px] leading-relaxed shadow-inner z-10 relative"
                 placeholder="Paste unstructured entity data (WhatsApp context) here..."
                 value={rawText}
                 onChange={e => setRawText(e.target.value)}
               />
               <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-teal-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity rounded-xl pointer-events-none" />
             </div>
             
             <button 
               onClick={handleRunPipeline}
               disabled={isProcessing || !rawText.trim()}
               className="mt-6 w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(13,148,136,0.3)] hover:shadow-[0_4px_25px_rgba(13,148,136,0.5)] active:scale-[0.98]"
             >
               {isProcessing ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
               Execute AI Pipeline
             </button>
          </motion.div>
        </div>

        {/* RIGHT COLUMN: Execution & Analysis */}
        <div className="lg:col-span-7 flex flex-col gap-6">
           
           {/* Terminal Activity Log */}
           <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.5, delay: 0.2 }}
             className="bg-black/80 backdrop-blur-sm border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-56"
           >
             <div className="bg-slate-900 border-b border-white/5 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Terminal className="text-slate-500" size={14} />
                   <span className="text-[11px] uppercase tracking-widest font-semibold text-slate-400">System Logs</span>
                </div>
                <div className="flex gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                   <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                   <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
             </div>
             <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 font-mono text-xs">
                {logs.length === 0 && <span className="text-slate-600 italic">SYSTEM IDLE...</span>}
                <AnimatePresence initial={false}>
                  {logs.map((log) => (
                    <motion.div 
                      key={log.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-3 leading-relaxed"
                    >
                      <span className="text-slate-600 shrink-0">
                        {new Date().toLocaleTimeString('en-US', { hour12: false })}
                      </span>
                      <span className={`flex-1 ${
                        log.status === 'error' ? 'text-rose-400' :
                        log.status === 'success' ? 'text-emerald-400' :
                        log.status === 'loading' ? 'text-sky-400' :
                        'text-slate-300'
                      }`}>
                        {log.status === 'success' && <span className="text-emerald-500 mr-1.5">✓</span>}
                        {log.status === 'error' && <span className="text-rose-500 mr-1.5">✗</span>}
                        {log.status === 'loading' && <span className="text-sky-500 mr-1.5 animate-pulse">➤</span>}
                        {log.status === 'info' && <span className="text-slate-500 mr-1.5">·</span>}
                        {log.message}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={endOfLogsRef} />
             </div>
           </motion.div>

           {/* Results Matrix & Commit Panel */}
           <AnimatePresence>
             {parsedData && targetSheet && readyToAppend && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95, y: 30 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.95 }}
                 transition={{ type: "spring", stiffness: 300, damping: 25 }}
                 className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex-1 flex flex-col ring-1 ring-white/5"
               >
                  <div className="p-6 bg-slate-900/50 backdrop-blur-lg flex flex-col h-full relative">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-3xl rounded-full" />
                    
                     <div className="flex items-start justify-between mb-8 pb-6 border-b border-white/5">
                        <div className="relative z-10">
                          <h2 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
                             <CornerDownRight size={20} className="text-emerald-400" />
                             Resolved Mapping
                          </h2>
                          <div className="mt-2 text-[13px] text-slate-400 flex flex-wrap items-center gap-2">
                            <span>Document:</span>
                            <span className="px-2 py-1 bg-[#070B14] rounded-md text-slate-200 border border-white/5 font-medium shadow-sm">
                              {targetSheet.spreadsheetName}
                            </span>
                            <span className="mx-1 text-slate-600">→</span>
                            <span>Tab:</span>
                            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-300 rounded-md border border-emerald-500/20 font-medium">
                              {targetSheet.tabName}
                            </span>
                          </div>
                        </div>
                     </div>

                     {/* Data Presentation Grid */}
                     <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8 relative z-10">
                        {Object.entries(parsedData).filter(([k,v]) => v !== undefined && v !== "").map(([key, val], i) => (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            key={key} 
                            className="flex flex-col bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:bg-slate-900/80 transition-colors group"
                          >
                            <span className="text-[10px] uppercase font-bold text-indigo-400/80 tracking-wider mb-2">
                              {key.replace('_', ' ')}
                            </span>
                            <span className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors" title={String(val)}>
                              {String(val)}
                            </span>
                          </motion.div>
                        ))}
                     </div>

                     {/* Duplicate Handling Card */}
                     <AnimatePresence>
                       {isDuplicate && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0, scale: 0.95 }}
                            animate={{ opacity: 1, height: 'auto', scale: 1 }}
                            className="mb-8 overflow-hidden"
                          >
                             <div className="bg-rose-950/20 border border-rose-900/50 p-5 rounded-xl relative shadow-[0_0_30px_rgba(244,63,94,0.05)]">
                               <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 rounded-l-xl" />
                               <div className="flex gap-4">
                                 <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20">
                                   <ShieldAlert className="text-rose-400" size={20} />
                                 </div>
                                 <div className="flex-1">
                                   <h3 className="text-rose-300 font-semibold mb-1 tracking-tight">Duplicate Policy Conflict</h3>
                                   <p className="text-rose-400/80 text-sm leading-relaxed mb-4">
                                     An identity mapping on the target spreadsheet already contains the string <span className="text-rose-200 font-mono bg-rose-500/20 px-1 py-0.5 rounded">{parsedData.whatsapp_no}</span>.
                                   </p>
                                   <label className="inline-flex items-center gap-3 cursor-pointer group bg-rose-950/30 px-3 py-2 rounded-lg border border-rose-900/50 hover:bg-rose-900/30 transition-colors">
                                     <input 
                                       type="checkbox" 
                                       checked={forceAppend}
                                       onChange={(e) => setForceAppend(e.target.checked)}
                                       className="w-4 h-4 rounded bg-slate-900 border-rose-700 text-rose-500 focus:ring-rose-500/30 focus:ring-offset-0 cursor-pointer"
                                     />
                                     <span className="text-sm font-medium text-rose-300 group-hover:text-rose-200 transition-colors">
                                       Acknowledge & Force Append
                                     </span>
                                   </label>
                                 </div>
                               </div>
                             </div>
                          </motion.div>
                       )}
                     </AnimatePresence>

                     <div className="mt-auto relative z-10 pt-4">
                       <button 
                         onClick={handleAppend}
                         disabled={isProcessing || (isDuplicate && !forceAppend)}
                         className="w-full bg-slate-800 border border-white/10 hover:bg-slate-700 text-white font-medium py-4 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(0,0,0,0.5)] active:scale-[0.99] group disabled:active:scale-100"
                       >
                         {isProcessing ? <RefreshCw className="animate-spin text-slate-400" size={18} /> : <Send size={18} className="text-teal-400 group-hover:text-teal-300 group-disabled:text-slate-500" />}
                         <span className={isDuplicate && !forceAppend ? 'text-slate-400' : ''}>
                           {isDuplicate && !forceAppend ? "Action Locked by Duplicate Policy" : "Commit to Workspace"}
                         </span>
                       </button>
                     </div>
                  </div>
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
