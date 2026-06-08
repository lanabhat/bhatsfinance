from datetime import date

from django.db.utils import OperationalError, ProgrammingError
from rest_framework import serializers as drf_serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from networth_tree.models import NetWorthTreeNode, NetWorthTreeSnapshot
from networth_tree.serializers import NetWorthTreeNodeCreateSerializer, NetWorthTreeNodeUpdateSerializer
from networth_tree.services import resolve_snapshot, seed_snapshot


def _migration_not_ready_response(exc: Exception):
    return Response(
        {
            'detail': 'Net Worth Tree tables are not available. Run migrations for networth_tree.',
            'error': str(exc),
        },
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


class NetWorthTreeView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        as_of_param = request.query_params.get('as_of')
        if not household_id or not as_of_param:
            raise drf_serializers.ValidationError({'detail': 'household_id and as_of query params are required.'})

        as_of = date.fromisoformat(as_of_param)
        try:
            snapshot = NetWorthTreeSnapshot.objects.filter(household_id=int(household_id), as_of_date=as_of).first()
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)
        if not snapshot:
            return Response({'snapshot': None})
        try:
            return Response(resolve_snapshot(snapshot))
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)


class NetWorthTreeSeedView(APIView):
    def post(self, request):
        household_id = request.data.get('household_id')
        as_of_param = request.data.get('as_of')
        if not household_id or not as_of_param:
            raise drf_serializers.ValidationError({'detail': 'household_id and as_of are required.'})
        as_of = date.fromisoformat(str(as_of_param))
        try:
            snapshot = seed_snapshot(int(household_id), as_of)
            return Response(resolve_snapshot(snapshot), status=status.HTTP_201_CREATED)
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)


class NetWorthTreeNodeCreateView(APIView):
    def post(self, request):
        try:
            serializer = NetWorthTreeNodeCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            snapshot = NetWorthTreeSnapshot.objects.get(pk=serializer.instance.snapshot_id)
            return Response(resolve_snapshot(snapshot), status=status.HTTP_201_CREATED)
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)


class NetWorthTreeNodeDetailView(APIView):
    def patch(self, request, pk: int):
        try:
            node = NetWorthTreeNode.objects.get(pk=pk)
        except NetWorthTreeNode.DoesNotExist:
            return Response({'detail': 'Node not found.'}, status=status.HTTP_404_NOT_FOUND)
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)

        try:
            serializer = NetWorthTreeNodeUpdateSerializer(node, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            snapshot = NetWorthTreeSnapshot.objects.get(pk=node.snapshot_id)
            return Response(resolve_snapshot(snapshot))
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)

    def delete(self, request, pk: int):
        try:
            node = NetWorthTreeNode.objects.get(pk=pk)
        except NetWorthTreeNode.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)

        try:
            snapshot = NetWorthTreeSnapshot.objects.get(pk=node.snapshot_id)
            node.delete()
            return Response(resolve_snapshot(snapshot))
        except (OperationalError, ProgrammingError) as exc:
            return _migration_not_ready_response(exc)
