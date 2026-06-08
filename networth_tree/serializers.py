from rest_framework import serializers

from networth_tree.models import NetWorthTreeNode, NetWorthTreeSnapshot


class NetWorthTreeSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = NetWorthTreeSnapshot
        fields = ['id', 'household', 'as_of_date', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class NetWorthTreeNodeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NetWorthTreeNode
        fields = [
            'id',
            'snapshot',
            'parent',
            'name',
            'kind',
            'linked_category',
            'linked_instrument',
            'target_value',
            'current_value_override',
            'sort_order',
            'is_collapsed',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        snapshot = attrs.get('snapshot')
        parent = attrs.get('parent')
        kind = attrs.get('kind')

        if parent and parent.snapshot_id != snapshot.id:
            raise serializers.ValidationError({'parent': 'Parent node must belong to same snapshot.'})

        if kind == NetWorthTreeNode.NodeKind.LINKED_CATEGORY and not attrs.get('linked_category'):
            raise serializers.ValidationError({'linked_category': 'linked_category is required for linked_category nodes.'})
        if kind == NetWorthTreeNode.NodeKind.LINKED_INSTRUMENT and not attrs.get('linked_instrument'):
            raise serializers.ValidationError({'linked_instrument': 'linked_instrument is required for linked_instrument nodes.'})
        if kind != NetWorthTreeNode.NodeKind.LINKED_CATEGORY and attrs.get('linked_category'):
            raise serializers.ValidationError({'linked_category': 'linked_category allowed only for linked_category nodes.'})
        if kind != NetWorthTreeNode.NodeKind.LINKED_INSTRUMENT and attrs.get('linked_instrument'):
            raise serializers.ValidationError({'linked_instrument': 'linked_instrument allowed only for linked_instrument nodes.'})

        return attrs


class NetWorthTreeNodeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NetWorthTreeNode
        fields = [
            'parent',
            'name',
            'kind',
            'linked_category',
            'linked_instrument',
            'target_value',
            'current_value_override',
            'sort_order',
            'is_collapsed',
        ]

    def validate(self, attrs):
        node: NetWorthTreeNode = self.instance
        snapshot_id = node.snapshot_id
        parent = attrs.get('parent')
        if parent:
            if parent.snapshot_id != snapshot_id:
                raise serializers.ValidationError({'parent': 'Parent node must belong to same snapshot.'})
            if parent.id == node.id:
                raise serializers.ValidationError({'parent': 'Node cannot be its own parent.'})

            ancestor = parent
            while ancestor is not None:
                if ancestor.id == node.id:
                    raise serializers.ValidationError({'parent': 'Cannot move node under its own descendant.'})
                ancestor = ancestor.parent

        next_kind = attrs.get('kind', node.kind)
        linked_category = attrs.get('linked_category', node.linked_category)
        linked_instrument = attrs.get('linked_instrument', node.linked_instrument)

        if next_kind == NetWorthTreeNode.NodeKind.LINKED_CATEGORY and not linked_category:
            raise serializers.ValidationError({'linked_category': 'linked_category is required for linked_category nodes.'})
        if next_kind == NetWorthTreeNode.NodeKind.LINKED_INSTRUMENT and not linked_instrument:
            raise serializers.ValidationError({'linked_instrument': 'linked_instrument is required for linked_instrument nodes.'})
        if next_kind != NetWorthTreeNode.NodeKind.LINKED_CATEGORY and linked_category:
            raise serializers.ValidationError({'linked_category': 'linked_category allowed only for linked_category nodes.'})
        if next_kind != NetWorthTreeNode.NodeKind.LINKED_INSTRUMENT and linked_instrument:
            raise serializers.ValidationError({'linked_instrument': 'linked_instrument allowed only for linked_instrument nodes.'})

        return attrs

