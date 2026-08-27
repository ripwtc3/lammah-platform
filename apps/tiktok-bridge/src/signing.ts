export function connectorSigningOptions(): Record<string, unknown> {
  const apiKey = process.env.EULER_SIGN_API_KEY?.trim();
  return apiKey ? { signApiKey: apiKey } : {};
}
