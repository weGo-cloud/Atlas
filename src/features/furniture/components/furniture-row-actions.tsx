"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FurnitureDeleteDialog } from "./furniture-delete-dialog";

export function FurnitureRowActions({
  productId,
  name,
  canDelete,
}: {
  productId: string;
  name: string;
  /** Mission 013's rationale applies identically here: this hides the control as a UX convenience only — deleteFurnitureProductAction enforces the real check server-side regardless. */
  canDelete: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/app/inventory/${productId}`}>View product</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/app/inventory/${productId}/edit`}>Edit</Link>
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete product
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canDelete && (
        <FurnitureDeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} productId={productId} name={name} />
      )}
    </>
  );
}
