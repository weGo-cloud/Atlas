"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteFurnitureProductAction } from "../actions/furniture-product-actions";

export function FurnitureDeleteDialog({
  open,
  onOpenChange,
  productId,
  name,
  redirectTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  name: string;
  /** Pass the inventory list URL from the detail page (the product no longer exists to view); omit from the list page, where staying put and refreshing is enough. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    const result = await deleteFurnitureProductAction(productId);
    setIsDeleting(false);

    if (!result.ok) {
      onOpenChange(false);
      window.alert(result.error.message);
      return;
    }

    onOpenChange(false);

    if (result.outcome.mediaCleanupFailures > 0) {
      window.alert(
        `Product deleted. ${result.outcome.mediaCleanupFailures} photo file(s) could not be removed from storage and may need manual cleanup.`
      );
    }

    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete product?</DialogTitle>
          <DialogDescription>
            This will permanently delete <span className="font-medium text-foreground">{name}</span>, including its
            photos. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isDeleting} className="gap-1.5">
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
