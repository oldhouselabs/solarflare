"use client";

import React from "react";
import { MyKanban } from "./components/MyKanban";

export default function Home() {
  return (
    <div className="w-screen p-4">
      <MyKanban />
    </div>
  );
}
