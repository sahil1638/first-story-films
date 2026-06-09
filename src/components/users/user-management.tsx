"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Plus, X, Pencil, Key, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { createUser, updateUserDetails, changeUserPassword, deleteUser } from "@/lib/actions/users";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/types/database";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales", label: "Sales" },
];

export function UserManagement({ users }: { users: Profile[] }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  // Add User Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "sales" as UserRole,
  });
  const [addFormErrors, setAddFormErrors] = useState({
    name: "",
    email: "",
    password: "",
  });

  // Edit User Details Modal State
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    role: "sales" as UserRole,
  });
  const [editFormErrors, setEditFormErrors] = useState({
    name: "",
  });

  // Change Password Modal State
  const [passwordUser, setPasswordUser] = useState<Profile | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Delete User Confirmation State
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setMounted(true);
    }, 0);
    // Resolve active logged-in user id
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showAddModal || !!editingUser || !!passwordUser || !!deletingUser;
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showAddModal, editingUser, passwordUser, deletingUser]);

  // Form Validations
  function validateAddForm() {
    const errors = { name: "", email: "", password: "" };
    let isValid = true;

    if (!addForm.name.trim()) {
      errors.name = "Name is required";
      isValid = false;
    }

    if (!addForm.email.trim()) {
      errors.email = "Email is required";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(addForm.email)) {
      errors.email = "Invalid email format";
      isValid = false;
    }

    if (!addForm.password) {
      errors.password = "Password is required";
      isValid = false;
    } else if (addForm.password.length < 6) {
      errors.password = "Password must be at least 6 characters";
      isValid = false;
    }

    setAddFormErrors(errors);
    return isValid;
  }

  function validateEditForm() {
    const errors = { name: "" };
    let isValid = true;

    if (!editForm.name.trim()) {
      errors.name = "Name is required";
      isValid = false;
    }

    setEditFormErrors(errors);
    return isValid;
  }

  // Submission Handlers
  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAddForm()) return;

    setAddLoading(true);
    setError("");
    try {
      await createUser(addForm);
      setShowAddModal(false);
      setAddForm({
        name: "",
        email: "",
        password: "",
        role: "sales",
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser || !validateEditForm()) return;

    setEditLoading(true);
    setError("");
    try {
      await updateUserDetails(editingUser.id, editForm);
      setEditingUser(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setEditLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordUser) return;

    if (!newPassword || newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    setPasswordLoading(true);
    setError("");
    try {
      await changeUserPassword(passwordUser.id, newPassword);
      setPasswordUser(null);
      setNewPassword("");
      setPasswordError("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update password");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingUser) return;

    setDeleteLoading(true);
    setError("");
    try {
      await deleteUser(deletingUser.id);
      setDeletingUser(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-5 mb-6">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">User Management</h1>
        <Button
          size="sm"
          onClick={() => {
            setError("");
            setAddFormErrors({ name: "", email: "", password: "" });
            setShowAddModal(true);
          }}
          tooltip="Add User"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Card className="p-0 md:p-0 overflow-hidden text-stone-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200">
              <tr>
                <th className="px-4 py-1.5 md:px-5 font-medium">Name</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Email</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Role</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map((user) => {
                const isCurrentUser = user.id === currentUserId;
                return (
                  <tr key={user.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-4 py-1.5 md:px-5 font-medium text-stone-900">{user.full_name || "—"}</td>
                    <td className="px-4 py-1.5 md:px-5 text-stone-600">{user.email}</td>
                    <td className="px-4 py-1.5 md:px-5">
                      <span className={`font-semibold text-xs tracking-wider ${
                        user.role === "admin" ? "text-amber-600" :
                        user.role === "manager" ? "text-stone-500" :
                        "text-blue-600"
                      }`}>
                        {user.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 md:px-5 text-right no-print">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setError("");
                            setEditFormErrors({ name: "" });
                            setEditForm({ name: user.full_name || "", role: user.role });
                            setEditingUser(user);
                          }}
                          tooltip="Edit User"
                          className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                        >
                          <Pencil className="h-4 w-4 text-stone-600" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setError("");
                            setPasswordError("");
                            setNewPassword("");
                            setPasswordUser(user);
                          }}
                          tooltip="Password"
                          className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                        >
                          <Key className="h-4 w-4 text-amber-600" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isCurrentUser}
                          onClick={() => {
                            setError("");
                            setDeletingUser(user);
                          }}
                          tooltip={isCurrentUser ? "Disabled" : "Delete"}
                          className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                        >
                          <Trash2 className={`h-4 w-4 ${isCurrentUser ? "text-stone-300" : "text-red-500"}`} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add User Modal */}
      {mounted && showAddModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => {
              if (!addLoading) setShowAddModal(false);
            }}
          />

          <form
            onSubmit={handleAddSubmit}
            className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
          >
            <button
              type="button"
              disabled={addLoading}
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10 disabled:opacity-50"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              Add New User
            </h3>

            <div className="space-y-4 pr-1 flex-1 overflow-y-auto">
              <Input
                label="Full Name"
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={addForm.name}
                error={addFormErrors.name}
                disabled={addLoading}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />

              <Input
                label="Email Address"
                type="email"
                required
                placeholder="e.g. rahul@firststoryfilms.com"
                value={addForm.email}
                error={addFormErrors.email}
                disabled={addLoading}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />

              <Input
                label="Password"
                type="password"
                required
                placeholder="Minimum 6 characters"
                value={addForm.password}
                error={addFormErrors.password}
                disabled={addLoading}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              />

              <Select
                label="System Role"
                required
                options={ROLE_OPTIONS}
                value={addForm.role}
                disabled={addLoading}
                onChange={(e) => setAddForm({ ...addForm, role: e.target.value as UserRole })}
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={addLoading}
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={addLoading}
              >
                Create User
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Edit User Modal */}
      {mounted && editingUser && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => {
              if (!editLoading) setEditingUser(null);
            }}
          />

          <form
            onSubmit={handleEditSubmit}
            className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
          >
            <button
              type="button"
              disabled={editLoading}
              onClick={() => setEditingUser(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10 disabled:opacity-50"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-1">
              Edit User Details
            </h3>
            <p className="text-xs text-stone-500 mb-4 truncate">{editingUser.email}</p>

            <div className="space-y-4 pr-1 flex-1 overflow-y-auto">
              <Input
                label="Full Name"
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={editForm.name}
                error={editFormErrors.name}
                disabled={editLoading}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />

              <Select
                label="System Role"
                required
                options={ROLE_OPTIONS}
                value={editForm.role}
                disabled={editLoading}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={editLoading}
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={editLoading}
              >
                Save Details
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Change Password Modal */}
      {mounted && passwordUser && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => {
              if (!passwordLoading) setPasswordUser(null);
            }}
          />

          <form
            onSubmit={handlePasswordSubmit}
            className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
          >
            <button
              type="button"
              disabled={passwordLoading}
              onClick={() => setPasswordUser(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10 disabled:opacity-50"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-1">
              Change User Password
            </h3>
            <p className="text-xs text-stone-500 mb-4 truncate">{passwordUser.full_name || passwordUser.email}</p>

            <div className="space-y-4 pr-1 flex-1 overflow-y-auto">
              <Input
                label="New Password"
                type="password"
                required
                placeholder="Minimum 6 characters"
                value={newPassword}
                error={passwordError}
                disabled={passwordLoading}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError("");
                }}
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={passwordLoading}
                onClick={() => setPasswordUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={passwordLoading}
              >
                Update Password
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Delete User Confirmation Modal */}
      {mounted && deletingUser && (
        <ConfirmationModal
          isOpen={!!deletingUser}
          title="Delete User Account?"
          message={`Are you sure you want to permanently delete the user account for "${deletingUser.full_name || deletingUser.email}"?`}
          confirmLabel="Delete Account"
          cancelLabel="Keep Account"
          variant="danger"
          loading={deleteLoading}
          onClose={() => setDeletingUser(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
  </div>
  );
}
