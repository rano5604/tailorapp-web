"use client";
import dynamic from "next/dynamic";

const PayButton = dynamic(() => import("./PayButton.client"), { ssr: false });

export default function PayButtonWrapper() {
    return <PayButton />;
}
