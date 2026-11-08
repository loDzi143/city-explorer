import { createBrowserRouter } from "react-router"

import { WorkspacePage } from "@/app/routes/workspace"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <WorkspacePage />,
  },
])
