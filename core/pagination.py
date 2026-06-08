from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default pagination — lets clients request a page size via ?page_size=, capped to avoid abuse."""
    page_size_query_param = 'page_size'
    max_page_size = 200
