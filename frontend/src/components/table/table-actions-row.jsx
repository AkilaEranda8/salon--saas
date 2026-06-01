import { TableActionsRow as RtcTableActionsRow } from 'react-table-craft';

/**
 * Docs-style `actions={[{ label, onClick, variant? }]}` or npm-style
 * `editAction` / `showAction` / `deleteAction`.
 */
export function TableActionsRow({ actions, editAction, showAction, deleteAction, ...rest }) {
  if (actions?.length) {
    const edit = actions.find((a) => /^edit$/i.test(a.label));
    const show = actions.find((a) => /^view|show$/i.test(a.label));
    const del = actions.find(
      (a) => a.variant === 'destructive' || /^delete$/i.test(a.label),
    );
    const more = actions.filter((a) => a !== edit && a !== del && a !== show);

    return (
      <RtcTableActionsRow
        editAction={edit ? { action: edit.onClick, disabled: edit.disabled } : undefined}
        showAction={show ? { action: show.onClick, disabled: show.disabled } : showAction}
        deleteAction={del ? { action: del.onClick, disabled: del.disabled } : undefined}
        dropMoreActions={more.map((a) => ({
          text: a.label,
          function: a.onClick,
          disabled: a.disabled,
        }))}
        {...rest}
      />
    );
  }

  return (
    <RtcTableActionsRow
      editAction={editAction}
      showAction={showAction}
      deleteAction={deleteAction}
      {...rest}
    />
  );
}
