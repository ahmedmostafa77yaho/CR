import React, { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { MainDashboard } from './components/MainDashboard';
import { initAuth, googleSignIn } from './lib/auth';
import { User } from 'firebase/auth';
import { LogIn, Database } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u) => { setUser(u); setLoading(false); },
      () => { setUser(null); setLoading(false); }
    );
    return () => unsubscribe();
  }, []);

  if (loading) {
     return (
       <div className="min-h-screen bg-[#070B14] flex items-center justify-center">
         <motion.div 
           animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
           transition={{ repeat: Infinity, duration: 1.5 }}
           className="text-teal-500 font-medium tracking-wide flex items-center gap-3"
         >
           <Database size={24} />
           <span>جاري تحميل مدون الكورسات...</span>
         </motion.div>
       </div>
     );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#070B14] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-[#070B14] to-[#070B14] flex items-center justify-center p-4 font-sans relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-10 rounded-2xl max-w-md w-full text-center shadow-2xl ring-1 ring-white/5 relative z-10"
        >
           <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/10 flex items-center justify-center mx-auto mb-8 border border-teal-500/20 shadow-inner">
              <Database size={36} className="text-teal-400" />
           </div>
           <h1 className="text-3xl font-semibold text-white mb-4 tracking-tight">بوابة مدون الكورسات</h1>
           <p className="text-slate-400 mb-10 text-sm leading-relaxed max-w-[280px] mx-auto">
             تحليل رسائل الواتساب تلقائياً وإدخال بيانات المشتركين مباشرةً إلى جداول بيانات جوجل بكل سهولة وأمان.
           </p>
           <button 
             onClick={async () => {
               const result = await googleSignIn();
               if (result) setUser(result.user);
             }}
             className="w-full bg-white text-slate-900 hover:bg-slate-100 transition-all py-3.5 rounded-xl font-semibold flex items-center justify-center gap-3 cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:-translate-y-0.5"
           >
             <LogIn size={20} />
             تسجيل الدخول باستخدام جوجل
           </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B14] flex flex-col font-sans">
      <TopBar user={user} />
      <MainDashboard />
    </div>
  );
}
