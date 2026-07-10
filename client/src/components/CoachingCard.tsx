import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  GraduationCap,
  Target,
  CheckCircle2,
  Share2,
  BookOpen,
} from "lucide-react";

interface CoachingCardProps {
  engineerName: string;
  avatarUrl?: string;
  firstFixRate: number;
  topIssues: string[];
  recommendation: string;
}

export function CoachingCard({
  engineerName,
  avatarUrl,
  firstFixRate,
  topIssues,
  recommendation,
}: CoachingCardProps) {
  return (
    <Card className="overflow-hidden border-l-4 border-l-primary">
      <CardHeader className="pb-3 bg-[#F9F9F9]/50">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback>
                {engineerName
                  .split(" ")
                  .map(n => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{engineerName}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                First Fix Rate:
                <Badge
                  variant={firstFixRate < 85 ? "destructive" : "secondary"}
                  className="text-xs px-1.5 py-0 h-5"
                >
                  {firstFixRate}%
                </Badge>
              </CardDescription>
            </div>
          </div>
          <GraduationCap className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Target className="h-3 w-3" />
            Focus Areas
          </h4>
          <ul className="space-y-1">
            {topIssues.map((issue, idx) => (
              <li
                key={idx}
                className="text-sm flex items-start gap-2 text-[#333030]"
              >
                <span className="text-primary mt-1.5 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-[rgba(190,218,65,0.12)] p-3 rounded-md border border-primary/30">
          <h4 className="text-xs font-semibold text-[#333030] mb-1 flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            AI Recommendation
          </h4>
          <p className="text-sm text-[#4A4646] leading-relaxed">
            {recommendation}
          </p>
        </div>
      </CardContent>
      <CardFooter className="bg-[#F9F9F9]/50 py-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1.5" />
          Mark Reviewed
        </Button>
        <Button size="sm" className="h-8 text-xs">
          <Share2 className="h-3 w-3 mr-1.5" />
          Share with Engineer
        </Button>
      </CardFooter>
    </Card>
  );
}
