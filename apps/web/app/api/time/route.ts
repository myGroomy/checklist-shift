// API endpoint untuk kalibrasi waktu server (BR-23)
// Mengembalikan header Date yang sudah standar HTTP

import { NextResponse } from "next/server";

export async function GET() {
  // Response dengan header Date standar HTTP (GMT)
  const now = new Date();
  const dateHeader = now.toUTCString(); // Format: "Mon, 01 Jan 2024 12:00:00 GMT"

  return new NextResponse(JSON.stringify({
    server_time: now.toISOString(),
    date_header: dateHeader,
    timestamp: now.getTime(),
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Date": dateHeader,
      "Cache-Control": "no-store, must-revalidate",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export async function HEAD() {
  // HEAD request untuk kalibrasi ringan (hanya header)
  const now = new Date();
  const dateHeader = now.toUTCString();

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Date": dateHeader,
      "Cache-Control": "no-store, must-revalidate",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}