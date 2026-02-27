import { ChatWindow } from "../components/ChatWindow";

export function ChatPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">Chat with GST Bot</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ask questions about GST reconciliation, invoice matching, and tax
          compliance
        </p>
      </div>

      <div className="flex-1 p-6 overflow-hidden">
        <ChatWindow />
      </div>
    </div>
  );
}
