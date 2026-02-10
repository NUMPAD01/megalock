import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://megascan.app";
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("twitter_code_verifier")?.value;
  const expectedState = cookieStore.get("twitter_state")?.value;

  if (!code || !state || !codeVerifier || state !== expectedState) {
    return NextResponse.redirect(`${baseUrl}/profile?x_error=invalid_state`);
  }

  // Clean up cookies
  cookieStore.delete("twitter_code_verifier");
  cookieStore.delete("twitter_state");

  // Exchange code for access token
  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: `${baseUrl}/api/auth/callback/twitter`,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${baseUrl}/profile?x_error=token_failed`);
  }

  const tokenData = await tokenRes.json();

  // Fetch user info
  const userRes = await fetch(
    "https://api.twitter.com/2/users/me?user.fields=username",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    }
  );

  if (!userRes.ok) {
    return NextResponse.redirect(`${baseUrl}/profile?x_error=user_failed`);
  }

  const userData = await userRes.json();
  const username = userData.data?.username;

  if (!username) {
    return NextResponse.redirect(`${baseUrl}/profile?x_error=no_username`);
  }

  return NextResponse.redirect(
    `${baseUrl}/profile?verified_x=${encodeURIComponent(username)}`
  );
}
