import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WS_EVENTS, type WsMessage } from "@shared/schema";
import { shouldSuppressWsInvalidation } from "@/lib/mutation-tracker";

export function useWebSocket() {
  const queryClient = useQueryClient();
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
          
          if (message.type === 'update') {
            if (shouldSuppressWsInvalidation()) {
              return;
            }
            queryClient.invalidateQueries({ queryKey: ["/api/families"] });
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message", error);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected, reconnecting...");
        setTimeout(connect, 3000);
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
  }, [queryClient]);

  return wsRef.current;
}
