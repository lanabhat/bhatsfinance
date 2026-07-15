"""
Tags are meant to exist only as long as something uses them — deleting a Tag
directly is still supported via TagViewSet, but a Tag should never just sit
around unused after its last Transaction stops referencing it (whether that's
because the transaction was untagged or deleted outright).

These signals catch every path that can drop a Tag's last usage: M2M removal/
clear (Transaction.tags.set()/.remove()/.clear(), from the ledger edit form or
the SMS approval flow) and Transaction deletion (DRF destroy, Django admin,
shell, or any future cascade) — a shared signal is more robust here than
patching each call site individually, since it also covers admin-panel
deletes that a call-site helper would otherwise miss.
"""
from django.db.models.signals import m2m_changed, post_delete
from django.dispatch import receiver

from ledger.models import Tag, Transaction


def _delete_if_unused(tag_ids):
    Tag.objects.filter(pk__in=tag_ids, transactions__isnull=True).delete()


@receiver(m2m_changed, sender=Transaction.tags.through)
def cleanup_unused_tags_on_m2m_change(sender, instance, action, pk_set, **kwargs):
    if action not in ('post_remove', 'post_clear'):
        return
    if action == 'post_clear':
        # pk_set is None for post_clear — the affected tags are whatever was
        # attached before the clear, which is no longer queryable from
        # `instance` at this point, so check every tag in the household
        # scope is overkill; instead fall back to a full unused-tag sweep
        # scoped to this transaction's household (cheap: only runs on the
        # rare direct .tags.clear() call, not on every edit).
        Tag.objects.filter(household=instance.household, transactions__isnull=True).delete()
        return
    if pk_set:
        _delete_if_unused(pk_set)


@receiver(post_delete, sender=Transaction)
def cleanup_unused_tags_on_transaction_delete(sender, instance, **kwargs):
    # M2M rows through Transaction.tags are already gone by the time
    # post_delete fires (Django clears them as part of the delete collector
    # before this signal runs), so the affected tags can only be found by
    # re-deriving them from what's left — but since we can't see the removed
    # tag ids anymore, sweep the household for any now-unused tags instead.
    # Cheap in practice: a household's tag count is small and this only runs
    # once per deleted transaction, not per tag.
    Tag.objects.filter(household=instance.household, transactions__isnull=True).delete()
