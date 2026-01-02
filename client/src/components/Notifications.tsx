import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: "1",
    title: "Audit Completed",
    message: "Job Sheet JS-2024-045 has been successfully audited.",
    type: "success",
    timestamp: "2 mins ago",
    read: false,
  },
  {
    id: "2",
    title: "New Hold Item",
    message: "JS-2024-044 requires manual review (Missing Signature).",
    type: "warning",
    timestamp: "15 mins ago",
    read: false,
  },
  {
    id: "3",
    title: "System Update",
    message: "New validation rules (v2.1) are now active.",
    type: "info",
    timestamp: "1 hour ago",
    read: true,
  },
];

export function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotification = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive animate-pulse" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-4 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
              onClick={markAllAsRead}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className={`flex flex-col items-start gap-1 p-4 cursor-pointer ${
                    !notification.read ? "bg-muted/50" : ""
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start justify-between w-full gap-2">
                    <div className="flex items-center gap-2">
                      {notification.type === "success" && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {notification.type === "warning" && (
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      )}
                      {notification.type === "info" && (
                        <Info className="h-4 w-4 text-blue-500" />
                      )}
                      {notification.type === "error" && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium text-sm">{notification.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {notification.timestamp}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 hover:bg-transparent hover:text-destructive"
                        onClick={(e) => clearNotification(e, notification.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
                    {notification.message}
                  </p>
                  {!notification.read && (
                    <Badge variant="default" className="h-1.5 w-1.5 rounded-full p-0 absolute top-4 right-2" />
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
