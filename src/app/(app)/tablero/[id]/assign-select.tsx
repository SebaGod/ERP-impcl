"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { assignWorkOrder } from "../actions";

interface AssignSelectProps {
  workOrderId: string;
  currentUserId: string | null;
  members: { id: string; name: string }[];
}

export function AssignSelect({
  workOrderId,
  currentUserId,
  members,
}: AssignSelectProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={currentUserId ?? ""}
      disabled={isPending}
      onChange={(event) => {
        const userId = event.target.value || null;
        startTransition(async () => {
          await assignWorkOrder(workOrderId, userId);
        });
      }}
      className="h-9"
    >
      <option value="">Sin asignar</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </Select>
  );
}
