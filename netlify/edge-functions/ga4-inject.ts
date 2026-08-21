export default async (req: Request, context: any) => {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const marker = "</head>";
  if (!html.includes(marker)) return response;

  const injection = `
<script>
  window.SKLABS_ANALYTICS = {
    ga4MeasurementId: "G-JJ1WN7PY1Q"
  };
</script>
<script src="/measurement.js" defer></script>
`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(html.replace(marker, `${injection}${marker}`), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const config = {
  path: "/",
};
