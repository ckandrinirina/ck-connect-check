/**
 * Signing in to the router. Stub — T-17 RED.
 */

import type {
  LoginFailure,
  RouterCredential,
  SessionCredentials,
} from "./types.js";

export const LOGIN_ENDPOINT = "/api/user/login";
export const LOGOUT_ENDPOINT = "/api/user/logout";

export interface LoginReplyHeaders {
  setCookie: string | undefined;
  rollingToken: string | undefined;
}

export function scramblePassword(
  _user: string,
  _password: string,
  _token: string,
): string {
  throw new Error("not implemented");
}

export function loginRequestXml(
  _credential: RouterCredential,
  _token: string,
): string {
  throw new Error("not implemented");
}

export function logoutRequestXml(): string {
  throw new Error("not implemented");
}

export function readLoginReply(
  _xml: string,
  _headers: LoginReplyHeaders,
): SessionCredentials {
  throw new Error("not implemented");
}

export function loginRefusal(_error: unknown): LoginFailure | undefined {
  throw new Error("not implemented");
}
