from pathlib import Path

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.views import View


class FrontendAppView(View):
    """Serves the built React SPA shell for any non-API/non-admin route.

    Client-side hash routing (#/...) handles the rest, so every such
    route can be served the same index.html.
    """

    def get(self, request, *args, **kwargs):
        index_path = Path(settings.BASE_DIR) / 'frontend' / 'dist' / 'index.html'
        try:
            html = index_path.read_text(encoding='utf-8')
        except FileNotFoundError:
            return HttpResponseNotFound(
                'Frontend build not found — run `npm run build` in frontend/ and redeploy.'
            )
        response = HttpResponse(html, content_type='text/html')
        # Always revalidate the shell so a deploy's new chunk names are picked up at once
        # (the hashed /assets/* files it points to are cached long-term).
        response['Cache-Control'] = 'no-cache'
        return response
