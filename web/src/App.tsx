import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Stock } from "./pages/Stock";
import { Movements } from "./pages/Movements";
import { Suppliers } from "./pages/Suppliers";
import { Users } from "./pages/Users";
import { System } from "./pages/System";
import { PDV } from "./pages/PDV";
import { Checkout } from "./pages/Checkout";
import { Sales } from "./pages/Sales";
import { SaleDetails } from "./pages/SaleDetails";
import { Labels } from "./pages/Labels";
import { LabelsPrint } from "./pages/LabelsPrint";
import { Customers } from "./pages/Customers";
import { Consignments } from "./pages/Consignments";
import { ProtectedRoute } from "./components/ProtectedRoute";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/produtos"
          element={
            <ProtectedRoute>
              <Products />
            </ProtectedRoute>
          }
        />
        <Route
          path="/estoque"
          element={
            <ProtectedRoute>
              <Stock />
            </ProtectedRoute>
          }
        />
        <Route
          path="/movimentacoes"
          element={
            <ProtectedRoute>
              <Movements />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pdv"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <PDV />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkout"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <Checkout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendas"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <Sales />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendas/:saleId"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <SaleDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/labels"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <Labels />
            </ProtectedRoute>
          }
        />
        <Route
          path="/labels/print"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <LabelsPrint />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <Customers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/consignados"
          element={
            <ProtectedRoute roles={["ADMIN", "GERENTE", "OPERADOR"]}>
              <Consignments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fornecedores"
          element={
            <ProtectedRoute>
              <Suppliers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/usuarios"
          element={
            <ProtectedRoute>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sistema"
          element={
            <ProtectedRoute>
              <System />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
