import React from 'react';
import { motion } from 'framer-motion';

const LoadingScreen: React.FC = () => {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-900 text-white">
      <div className="relative mb-12 h-24 w-24 overflow-hidden rounded-3xl border-2 border-sky-400 p-2 shadow-lg shadow-sky-500/50">
        <div className="flex h-full w-full flex-col gap-2 p-2">
            <div className="flex h-6 w-full gap-2">
                <div className="h-4 w-4 rounded-full bg-sky-400 animate-pulse" />
                <div className="h-4 w-4 rounded-full bg-sky-400 animate-pulse delay-75" />
            </div>
            <div className="h-2 w-full rounded-full bg-sky-400/30 animate-pulse delay-150" />
            <div className="h-4 w-12 rounded-full border border-sky-400 mx-auto animate-pulse delay-300" />
        </div>
      </div>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-lg font-bold tracking-tight text-sky-400"
      >
        Initializing Curio...
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 0.5 }}
        className="mt-2 text-sm text-slate-500 animate-pulse"
      >
        Waking up Curio
      </motion.p>
    </div>
  );
};

export default LoadingScreen;
