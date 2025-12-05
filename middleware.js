import { clerkMiddleware } from "@clerk/nextjs/server";

// ★ 이 부분이 핵심입니다. 함수를 'export default'로 내보내야 합니다.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Next.js 내부 파일과 정적 파일 제외하고 모든 경로 보호
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};