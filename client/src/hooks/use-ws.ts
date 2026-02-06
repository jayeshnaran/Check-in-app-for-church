import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { WS_EVENTS, type WsMessage } from "@shared/schema";

export function useWebSocket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Connected to WebSocket");
      };

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          
          if (message.type === WS_EVENTS.UPDATE) {
            // Invalidate all family queries to trigger a refetch
            queryClient.invalidateQueries({ queryKey: ["/api/families"] });
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message", error);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected, reconnecting...");
        setTimeout(connect, 3000); // Reconnect after 3s
      };

      ws.onerror = (error) => {
        console.error("WebSocket error", error);
        ws.close();
      };
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [queryClient, toast]);

  return wsRef.current;
}
