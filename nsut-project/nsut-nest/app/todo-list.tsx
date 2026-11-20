"use client";

/**
 * Personal to-do list on the dashboard. It is device-local: a task is not
 * campus data, so it never leaves localStorage.
 */

import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

const TODO_KEY = "nsutnest_todos";

type Todo = { id: string; text: string; done: boolean };

function readTodos(): Todo[] {
  try {
    const raw = window.localStorage.getItem(TODO_KEY);
    const parsed = raw ? (JSON.parse(raw) as Todo[]) : [];
    return Array.isArray(parsed) ? parsed.filter((todo) => todo && typeof todo.text === "string") : [];
  } catch {
    return [];
  }
}

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTodos(readTodos());
    setReady(true);
  }, []);

  useEffect(() => {
    // Writing before the first read would wipe a list saved on this device.
    if (!ready) return;
    try {
      window.localStorage.setItem(TODO_KEY, JSON.stringify(todos));
    } catch {
      // Private mode or a full quota: the list still works for this visit.
    }
  }, [todos, ready]);

  function add() {
    const text = draft.trim();
    if (!text) return;
    setTodos((current) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, done: false }, ...current]);
    setDraft("");
  }

  return (
    <>
      <div className="todoAdd">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder="Add a task — assignment, fee, lab record…"
          aria-label="New task"
          maxLength={120}
        />
        <button type="button" onClick={add} disabled={!draft.trim()}>
          <Plus size={14} aria-hidden="true" /> Add
        </button>
      </div>

      {!todos.length ? (
        <p className="todoEmpty">Nothing yet. Add your first task above.</p>
      ) : (
        <ul className="todoList">
          {todos.map((todo) => (
            <li className={`todoItem ${todo.done ? "done" : ""}`.trim()} key={todo.id}>
              <button
                className="todoCheck"
                type="button"
                onClick={() => setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, done: !item.done } : item)))}
                aria-pressed={todo.done}
                aria-label={todo.done ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
              >
                {todo.done && <Check size={13} aria-hidden="true" />}
              </button>
              <b>{todo.text}</b>
              <button
                className="todoDelete"
                type="button"
                onClick={() => setTodos((current) => current.filter((item) => item.id !== todo.id))}
                aria-label={`Delete "${todo.text}"`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
