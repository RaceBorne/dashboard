import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { AIAssistantPane, AIPaneProvider } from '@/components/ai/AIAssistantPane';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Root viewport is fixed: h-screen + overflow-hidden so the sidebar,
  // any in-page top bar, and any fixed bottom rails (Strategy /
  // Discovery timeline) stay pinned. Inner content scrolls only.
  return (
    <AIPaneProvider>
      <div className="h-screen flex bg-evari-ink overflow-hidden">
        <AppSidebar />
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{children}</main>
        <AIAssistantPane />
        <CommandPalette />
      </div>
    </AIPaneProvider>
  );
}
