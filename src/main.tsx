import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AppLayout from "./ui/AppLayout";
import RecipeListPage from "./pages/RecipeListPage";
import RecipeNewPage from "./pages/RecipeNewPage";
import RecipeDetailPage from "./pages/RecipeDetailPage";
import RecipeEditPage from "./pages/RecipeEditPage";
import SharedRecipesPage from "./pages/SharedRecipesPage";
import CookModePage from "./pages/CookModePage";
import GroupsPage from "./pages/GroupsPage";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import { AuthProvider } from "./auth/AuthProvider";
import { initPWA } from "./pwa";
import "./index.css";

initPWA();

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <RecipeListPage /> },
          { path: "/shared", element: <SharedRecipesPage /> },
          { path: "/groups", element: <GroupsPage /> },
          { path: "/recipes/new", element: <RecipeNewPage /> },
          { path: "/recipes/:id", element: <RecipeDetailPage /> },
          { path: "/recipes/:id/cook", element: <CookModePage /> },
          { path: "/recipes/:id/edit", element: <RecipeEditPage /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
