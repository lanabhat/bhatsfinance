from django.test import SimpleTestCase


class FrontendServingTests(SimpleTestCase):
    """The built app's root-level files must be served as themselves — before these
    routes, /sw.js and /icons/* fell through to the SPA shell (index.html as text/html),
    so the service worker never registered and the PWA icons were broken."""

    def test_root_level_build_files_are_served_as_files(self):
        sw = self.client.get('/sw.js')
        self.assertEqual(sw.status_code, 200)
        self.assertIn('javascript', sw['Content-Type'])
        for path in ('/icons/icon-192.png', '/splash/splash-light-1170x2532.png', '/manifest.json'):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertNotIn('text/html', response['Content-Type'], path)

    def test_app_shell_is_always_revalidated(self):
        response = self.client.get('/holdings')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-cache')
        self.assertIn(b'<div id="root">', response.content)
