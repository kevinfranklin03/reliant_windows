import React, { useState, useEffect } from "react";
import StarInput from "./StarInput";
import {createCustomer, updateCustomer, deleteCustomer, archiveCustomer } from "../../lib/api/customers";
import type { Customer } from "../../lib/api/types"; 
type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  editing: Customer | null;
};

export default function CustomerModal({ open, onClose, onSaved, editing }: Props) {
  const [form, setForm] = useState<Partial<Customer>>({
    name:'', email:'', phone:'', satisfaction:3, postcode:'', interaction_channel:'website' as any
  });

  async function archive() {
  if (!editing) return;
  if (!confirm(`Archive ${editing.name}? They will be hidden from lists.`)) return;
  await archiveCustomer(editing.id);
  alert("Archived.");
  onClose();
  await onSaved();
}


  useEffect(() => {
    if (editing) {
      setForm({
        id: editing.id,
        name: editing.name,
        email: editing.email || '',
        phone: editing.phone || '',
        postcode: editing.postcode || '',
        satisfaction: editing.satisfaction ?? 0,
        interaction_channel: editing.interaction_channel || 'website'
      });
    } else {
      setForm({ name:'', email:'', phone:'', satisfaction:3, postcode:'', interaction_channel:'website' as any });
    }
  }, [editing]);

  async function submit(){
    try{
      if(!form.name){ alert('Please enter name'); return }
      if (editing) {
        await updateCustomer(editing.id, {
          name: form.name!,
          email: form.email || null,
          phone: form.phone || null,
          postcode: form.postcode || null,
          satisfaction: form.satisfaction ?? null,
          interaction_channel: form.interaction_channel as any
        });
      } else {
        if (!form.email && !form.phone) { alert('Email or phone required'); return }
        await createCustomer(form);
      }
      onClose();
      await onSaved();
    } catch (e:any) {
      alert(e?.message || 'Save failed');
    }
  }

    async function save() {
 if (!editing) {
     alert("Creating customers is disabled.");
     return;
   }
   await updateCustomer(editing.id, form);
   if (!editing) {
     await createCustomer(form);
   } else {
     await updateCustomer(editing.id, form);
   }
    onClose();
    await onSaved();
  }


  async function remove() {
    if (!editing) return;
    if(!confirm(`Delete ${editing.name}? This cannot be undone.`)) return;
    try{
      await deleteCustomer(editing.id);
      onClose();
      await onSaved();
    } catch (e:any) {
         // If the server says FK conflict (409), archive instead:
      const msg = String(e?.message ?? "");
      const isConflict = /(^|[^0-9])409([^0-9]|$)/.test(msg) || /related quotes|conflict/i.test(msg);
      if (isConflict) {
        await archiveCustomer(editing.id);
        alert('Customer has related quotes, so they were archived instead.');
        onClose();
        await onSaved();
      } else {
        alert(msg || 'Delete failed');
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-[720px] max-w-[95vw] rounded-2xl border border-white/10 bg-reliant-panel p-5 shadow-soft"
        onClick={e=>e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{editing ? 'Edit Customer' : 'Create Customer'}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <input className="field" placeholder="Name" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/>
          <input className="field" placeholder="Email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/>
          <input className="field" placeholder="Phone" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/>
          <input className="field" placeholder="Postcode" value={form.postcode||''} onChange={e=>setForm({...form,postcode:e.target.value})}/>
          <select
            className="field field-select text-black dark:text-white"
            value={(form as any).interaction_channel||'website'}
            onChange={e=>setForm({...form,interaction_channel:e.target.value as any})}
          >
            <option>website</option><option>phone</option><option>whatsapp</option>
            <option>referral</option><option>social</option><option>showroom</option><option>email</option>
          </select>

          <div className="flex items-center justify-between">
            <label className="text-sm opacity-80">Satisfaction</label>
            <StarInput value={form.satisfaction as number || 0}
                       onChange={(v)=>setForm({...form, satisfaction:v})}/>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">

          <div className="mt-5 flex justify-end gap-2">
  {editing && (
    <>
      <button className="btn" onClick={archive}>Archive</button>
      <button className="btn-danger" onClick={remove}>Delete</button>
    </>
  )}
  <button className="btn-primary" onClick={submit}>
    {editing ? 'Save changes' : 'Create'}
  </button>
</div>
        </div>
      </div>
    </div>
  );
}
