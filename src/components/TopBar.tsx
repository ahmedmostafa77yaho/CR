import React from 'react';
import { logout } from '../lib/auth';
import { User } from 'firebase/auth';
import { LogOut, Database } from 'lucide-react';
import { motion } from 'motion/react';

export function TopBar({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#070B14]/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
          <Database size={20} className="text-white" />
        </div>
        <h1 className="text-xl font-semibold text-slate-100 tracking-tight">مدون الكورسات</h1>
      </div>
      <div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3 hidden sm:flex bg-slate-900/50 rounded-full pl-2 pr-4 py-1.5 border border-white/5">
             <div className="w-7 h-7 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 font-medium text-xs border border-teal-500/30">
               {user.email?.charAt(0).toUpperCase()}
             </div>
             <span className="text-xs text-slate-400 font-medium">{user.email}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 bg-slate-800 text-slate-300 px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-700 hover:text-white transition-all cursor-pointer ring-1 ring-white/10 shadow-sm"
          >
            <LogOut size={16} />
            Disconnect
          </button>
        </div>
      </div>
    </header>
  );
}
