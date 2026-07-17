// The four crosshair registration marks that pair with the .blueprint class
// (see app/globals.css) on cards and primary buttons in the Industry design
// system. Render this as the first child of any element with className
// including "blueprint".
export function BlueprintCorners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}
