import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type WsMessage } from "@shared/schema";

type ConflictHandler = () => void;

let onConflictHandler: ConflictHandler | null = null;
let suppressConflictUntil = 0;

export function setConflictHandler(handler: ConflictHandler | null) {
  onConflictHandler = handler;
}

export function suppressConflict(ms: number = 2000) {
  suppressConflictUntil = Date.now() + ms;
}

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
            queryClient.invalidateQueries({ queryKey: ["/api/families"] });
            
            if (onConflictHandler && Date.now() > suppressConflictUntil) {
              onConflictHandler();
            }
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
