"use client";

import { Amplify } from "aws-amplify";

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
const appUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://hackathon.zzzzico.click";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: {
        oauth: {
          domain,
          scopes: ["openid", "profile"],
          redirectSignIn: [`${appUrl}/auth/callback`],
          redirectSignOut: [`${appUrl}/`],
          responseType: "code",
        },
      },
    },
  },
});

export {};
