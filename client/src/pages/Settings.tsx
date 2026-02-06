import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState(localStorage.getItem("pco_api_key") || "");
  const [appId, setAppId] = useState(localStorage.getItem("pco_app_id") || "");

  const handleSave = () => {
    localStorage.setItem("pco_api_key", apiKey);
    localStorage.setItem("pco_app_id", appId);
    toast({
      title: "Settings Saved",
      description: "Planning Center API details have been stored locally.",
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        </div>

        <Card className="rounded-3xl border-none shadow-sm bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Planning Center API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appId">Application ID</Label>
              <Input
                id="appId"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="Enter PCO Application ID"
                className="rounded-xl bg-muted/50 border-none h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">Secret Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter PCO Secret Key"
                className="rounded-xl bg-muted/50 border-none h-11"
              />
            </div>
            <Button 
              onClick={handleSave}
              className="w-full rounded-xl h-11 gap-2 font-bold"
            >
              <Save className="w-4 h-4" />
              Save Configuration
            </Button>
          </CardContent>
        </Card>

        <div className="p-4 rounded-2xl bg-primary/5 text-sm text-muted-foreground border border-primary/10">
          <p className="font-bold text-primary mb-1">Privacy Note</p>
          Your API keys are stored only in your browser's local storage and are never sent to our servers.
        </div>
      </div>
    </div>
  );
}
