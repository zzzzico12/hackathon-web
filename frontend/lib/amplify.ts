"use client";

import { Amplify } from "aws-amplify";

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: {
        oauth: {
          domain,
          scopes: ["openid", "profile", "aws.cognito.signin.user.admin"],
          redirectSignIn: [
            "http://localhost:3100/auth/callback",
          ],
          redirectSignOut: [
            "http://localhost:3100",
          ],
          responseType: "code",
        },
      },
    },
  },
});

export {};
