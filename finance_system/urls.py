from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve as static_serve
from core.views import CsrfView, MeView, LogoutView, SelectHouseholdView
from finance_system.frontend_views import FrontendAppView

FRONTEND_DIST = settings.BASE_DIR / 'frontend' / 'dist'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('social_django.urls', namespace='social')),
    path('api/auth/me/', MeView.as_view()),
    path('api/auth/logout/', LogoutView.as_view()),
    path('api/auth/select-household/', SelectHouseholdView.as_view()),
    path('api/', include('finance_system.api_urls')),
    # Built frontend assets (Vite emits these at the dist root: assets/, favicon.svg, etc.)
    re_path(
        r'^(?P<path>assets/.*|favicon\.svg|icons\.svg|manifest\.json|vite\.svg)$',
        static_serve,
        {'document_root': FRONTEND_DIST},
    ),
    # Catch-all: serve the React SPA shell for any other route (client-side hash routing)
    re_path(r'^(?!api/|admin/|static/).*$', FrontendAppView.as_view()),
]
