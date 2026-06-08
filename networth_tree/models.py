from decimal import Decimal

from django.db import models

from core.models import TimeStampedModel


class NetWorthTreeSnapshot(TimeStampedModel):
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='networth_tree_snapshots')
    as_of_date = models.DateField()

    class Meta:
        unique_together = ('household', 'as_of_date')
        ordering = ['-as_of_date', '-id']

    def __str__(self) -> str:
        return f'{self.household_id} @ {self.as_of_date}'


class NetWorthTreeNode(TimeStampedModel):
    class NodeKind(models.TextChoices):
        LINKED_CATEGORY = 'linked_category', 'Linked Category'
        LINKED_INSTRUMENT = 'linked_instrument', 'Linked Instrument'
        MANUAL_BRANCH = 'manual_branch', 'Manual Branch'
        MANUAL_ITEM = 'manual_item', 'Manual Item'

    snapshot = models.ForeignKey(NetWorthTreeSnapshot, on_delete=models.CASCADE, related_name='nodes')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField(max_length=140)
    kind = models.CharField(max_length=24, choices=NodeKind.choices)
    linked_category = models.ForeignKey(
        'instruments.AssetCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='networth_tree_nodes',
    )
    linked_instrument = models.ForeignKey(
        'instruments.Instrument',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='networth_tree_nodes',
    )
    target_value = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    current_value_override = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_collapsed = models.BooleanField(default=False)

    class Meta:
        ordering = ['sort_order', 'id']
        indexes = [
            models.Index(fields=['snapshot', 'parent', 'sort_order']),
            models.Index(fields=['snapshot', 'kind']),
        ]

    def __str__(self) -> str:
        return f'{self.name} ({self.kind})'

    @staticmethod
    def decimal_zero() -> Decimal:
        return Decimal('0.00')

