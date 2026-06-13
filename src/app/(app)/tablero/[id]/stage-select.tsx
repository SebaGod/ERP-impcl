"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { moveWorkOrder } from "../actions";

interface StageSelectProps {
  workOrderId: string;
  currentStageId: string;
  stages: { id: string; name: string }[];
}

export function StageSelect({
  workOrderId,
  currentStageId,
  stages,
}: StageSelectProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={currentStageId}
      disabled={isPending}
      onChange={(event) => {
        const toStageId = event.target.value;
        if (toStageId === currentStageId) return;
        startTransition(async () => {
          await moveWorkOrder(workOrderId, toStageId);
        });
      }}
      className="h-9 w-auto min-w-40"
    >
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.name}
        </option>
      ))}
    </Select>
  );
}
