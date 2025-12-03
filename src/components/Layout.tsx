import React from 'react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function Layout({ children, className }: LayoutProps) {
  return (
    <div className="min-h-screen w-full relative overflow-hidden text-foreground">
      {/* Liquid Background Elements - Disabled for clean background */}
      {/* <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-sky-500/20 blur-[120px]" />
      </div> */}
      
      <div className={cn("container mx-auto px-4 py-8 max-w-md md:max-w-2xl relative z-10", className)}>
        {children}
      </div>
    </div>
  );
}
