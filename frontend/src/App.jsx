/* SENTINEL — App router */
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { Layout } from "./components/Layout.jsx";

import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import CaseReview from "./pages/CaseReview.jsx";
import CohortExplorer from "./pages/CohortExplorer.jsx";
import DatasetView from "./pages/DatasetView.jsx";
import FairnessMonitor from "./pages/FairnessMonitor.jsx";
import ModelPerformance from "./pages/ModelPerformance.jsx";
import RagAssistant from "./pages/RagAssistant.jsx";
import AuditTrail from "./pages/AuditTrail.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/cohorts" element={<CohortExplorer />} />
          <Route path="/dataset" element={<DatasetView />} />
          <Route path="/case/:id" element={<CaseReview />} />
          <Route path="/fairness" element={<FairnessMonitor />} />
          <Route path="/models" element={<ModelPerformance />} />
          <Route path="/assistant" element={<RagAssistant />} />
          <Route path="/audit" element={<AuditTrail />} />
        </Route>

        {/* Default landing page after login (per CLAUDE.md). */}
        <Route path="/" element={<Navigate to="/cohorts" replace />} />
        <Route path="*" element={<Navigate to="/cohorts" replace />} />
      </Routes>
    </AuthProvider>
  );
}
