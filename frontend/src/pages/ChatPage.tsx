import { ChatWindow } from "../components/ChatWindow";

export function ChatPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 p-6 overflow-hidden">
        <ChatWindow />
      </div>
    </div>
  );
}
