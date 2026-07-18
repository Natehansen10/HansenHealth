import { Card } from "@/components/ui/card";

export function PrizeBanner({
  individualPrize,
  groupPrize,
  groupPrizeUnlocked,
}: {
  individualPrize: string | null;
  groupPrize: string | null;
  groupPrizeUnlocked: boolean;
}) {
  return (
    <Card className="mb-8">
      <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">
        What we&apos;re working toward
      </h2>
      <div className="flex flex-col gap-3">
        {individualPrize && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">
              Hit 100% this month
            </div>
            <p className="text-foreground">{individualPrize}</p>
          </div>
        )}
        {groupPrize && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">
              Group prize — everyone hits 100%
            </div>
            <p className="text-foreground">
              {groupPrize}
              {groupPrizeUnlocked && (
                <span className="ml-2 text-accent-900">Unlocked!</span>
              )}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
