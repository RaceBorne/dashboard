import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { AIAssistantPane, AIPaneProvider } from '@/components/ai/AIAssistantPane';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AIPaneProvider>
      <div className="flex min-h-screen bg-evari-ink">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
        <AIAssistantPane />
        <CommandPalette />
      </div>
    </AIPaneProvider>
  );
}
