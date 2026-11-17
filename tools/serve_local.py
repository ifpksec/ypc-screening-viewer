"""변환된 원문 HTML을 로컬(127.0.0.1)에서만 서비스합니다.
사용: python serve_local.py <html 폴더> [포트=8787]
사이트의 '원문 열기' 버튼이 http://localhost:8787/<번호>.html 을 엽니다."""
import sys, http.server, functools
root = sys.argv[1]; port = int(sys.argv[2]) if len(sys.argv) > 2 else 8787
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
print(f"serving {root} on http://localhost:{port}/")
http.server.ThreadingHTTPServer(("127.0.0.1", port), h).serve_forever()
