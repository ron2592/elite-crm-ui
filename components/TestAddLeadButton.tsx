"use client";

export default function TestAddLeadButton() {
  return (
    <button
      className="rounded-md bg-blue-600 px-4 py-2 text-white"
      onClick={async () => {
        try {
          const res = await fetch("/api/leads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              lead_name: "REAL TEST BUTTON",
              phone: "1234567890",
              email: "test@test.com",
              address_line_1: "123 Test",
              city: "Clifton",
              state: "NJ",
              source_email: "elitework.ron@gmail.com",
            }),
          });

          const text = await res.text();
          console.log("STATUS:", res.status);
          console.log("RAW RESPONSE:", text);

          if (!res.ok) {
            alert(`API Error ${res.status}: ${text}`);
            return;
          }

          const data = JSON.parse(text);
          console.log("RESULT:", data);
          alert("Lead created successfully!");
        } catch (err) {
          console.error("ERROR:", err);
          alert("Something went wrong. Check console/terminal.");
        }
      }}
    >
      TEST ADD LEAD
    </button>
  );
}